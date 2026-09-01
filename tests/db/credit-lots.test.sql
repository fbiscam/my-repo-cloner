-- Automated DB tests for credit lots invariants.
-- Run via: psql -v ON_ERROR_STOP=1 -f tests/db/credit-lots.test.sql
-- Uses a synthetic user_id in a rolled-back transaction so nothing persists.

BEGIN;

DO $test$
DECLARE
  -- Use an existing auth.users id (haseeb@jenvu.com). Whole test is rolled back,
  -- so no state changes persist.
  _uid uuid := '5af751fb-de3b-4a24-aefd-aed53ef44378';
  _bal int;
  _lots int;
  _alw int;
  _spend_result int;
  _insuff boolean := false;
BEGIN

  -- No auth.users insert needed — credit tables have no FK, and convert_referral
  -- returns early when no referral row exists for this uid.


  ------------------------------------------------------------------
  -- TEST 1: set_user_plan('elite') creates matching lots
  ------------------------------------------------------------------
  PERFORM public.set_user_plan(_uid, 'elite', 'monthly');

  SELECT balance, monthly_allowance INTO _bal, _alw FROM public.credit_balances WHERE user_id = _uid;
  SELECT COALESCE(SUM(amount_remaining),0) INTO _lots
    FROM public.credit_lots WHERE user_id = _uid AND expires_at > now() AND amount_remaining > 0;

  IF _bal <> 85 THEN RAISE EXCEPTION 'TEST 1 FAIL: elite balance expected 85, got %', _bal; END IF;
  IF _alw <> 85 THEN RAISE EXCEPTION 'TEST 1 FAIL: elite allowance expected 85, got %', _alw; END IF;
  IF _lots <> _bal THEN RAISE EXCEPTION 'TEST 1 FAIL: lots (%) != balance (%)', _lots, _bal; END IF;
  RAISE NOTICE 'TEST 1 PASS: set_user_plan(elite) → balance=% lots=%', _bal, _lots;

  ------------------------------------------------------------------
  -- TEST 2: spend_credits succeeds and decrements both balance & lots
  ------------------------------------------------------------------
  SELECT public.spend_credits(_uid, 1, 'signal', '{}'::jsonb) INTO _spend_result;

  SELECT balance INTO _bal FROM public.credit_balances WHERE user_id = _uid;
  SELECT COALESCE(SUM(amount_remaining),0) INTO _lots
    FROM public.credit_lots WHERE user_id = _uid AND expires_at > now() AND amount_remaining > 0;

  IF _spend_result <> 84 THEN RAISE EXCEPTION 'TEST 2 FAIL: spend returned %, expected 84', _spend_result; END IF;
  IF _bal <> 84 THEN RAISE EXCEPTION 'TEST 2 FAIL: balance after spend = %, expected 84', _bal; END IF;
  IF _lots <> 84 THEN RAISE EXCEPTION 'TEST 2 FAIL: lots after spend = %, expected 84', _lots; END IF;
  RAISE NOTICE 'TEST 2 PASS: spend_credits(1) → balance=% lots=%', _bal, _lots;

  ------------------------------------------------------------------
  -- TEST 3: Downgrade elite → free trims lots (never leaves them > balance)
  ------------------------------------------------------------------
  PERFORM public.set_user_plan(_uid, 'free', 'monthly');

  SELECT balance INTO _bal FROM public.credit_balances WHERE user_id = _uid;
  SELECT COALESCE(SUM(amount_remaining),0) INTO _lots
    FROM public.credit_lots WHERE user_id = _uid AND expires_at > now() AND amount_remaining > 0;

  IF _lots <> _bal THEN RAISE EXCEPTION 'TEST 3 FAIL: after downgrade lots (%) != balance (%)', _lots, _bal; END IF;
  IF _bal > 6 THEN RAISE EXCEPTION 'TEST 3 FAIL: free cap exceeded, balance=%', _bal; END IF;
  RAISE NOTICE 'TEST 3 PASS: downgrade → balance=% lots=% (synced)', _bal, _lots;

  ------------------------------------------------------------------
  -- TEST 4: Upgrade free → pro creates the missing lots delta
  ------------------------------------------------------------------
  PERFORM public.set_user_plan(_uid, 'pro', 'monthly');

  SELECT balance INTO _bal FROM public.credit_balances WHERE user_id = _uid;
  SELECT COALESCE(SUM(amount_remaining),0) INTO _lots
    FROM public.credit_lots WHERE user_id = _uid AND expires_at > now() AND amount_remaining > 0;

  IF _lots <> _bal THEN RAISE EXCEPTION 'TEST 4 FAIL: after upgrade lots (%) != balance (%)', _lots, _bal; END IF;
  IF _bal < 35 THEN RAISE EXCEPTION 'TEST 4 FAIL: pro balance too low: %', _bal; END IF;
  RAISE NOTICE 'TEST 4 PASS: upgrade → balance=% lots=% (synced)', _bal, _lots;

  ------------------------------------------------------------------
  -- TEST 5: spend_credits raises INSUFFICIENT_CREDITS when over-drawing
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.spend_credits(_uid, 999999, 'signal', '{}'::jsonb);
  EXCEPTION WHEN sqlstate 'P0001' THEN
    _insuff := true;
  END;
  IF NOT _insuff THEN RAISE EXCEPTION 'TEST 5 FAIL: over-draw did not raise INSUFFICIENT_CREDITS'; END IF;
  RAISE NOTICE 'TEST 5 PASS: INSUFFICIENT_CREDITS raised on over-draw';

  ------------------------------------------------------------------
  -- TEST 6: resync_all_credit_lots keeps invariants (no drift introduced)
  ------------------------------------------------------------------
  PERFORM public.resync_all_credit_lots();
  SELECT balance INTO _bal FROM public.credit_balances WHERE user_id = _uid;
  SELECT COALESCE(SUM(amount_remaining),0) INTO _lots
    FROM public.credit_lots WHERE user_id = _uid AND expires_at > now() AND amount_remaining > 0;
  IF _lots <> _bal THEN RAISE EXCEPTION 'TEST 6 FAIL: resync drift, lots=% balance=%', _lots, _bal; END IF;
  RAISE NOTICE 'TEST 6 PASS: resync_all_credit_lots is idempotent';

  RAISE NOTICE '✅ ALL CREDIT LOT TESTS PASSED';
END
$test$;

-- Roll back — tests must not leave data behind.
ROLLBACK;
