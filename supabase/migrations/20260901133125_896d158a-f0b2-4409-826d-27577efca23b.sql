SELECT cron.schedule(
  'daily-insight-article',
  '10 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/generate-insight',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','78102da0a873fdb0ef66cee2652e7470ee80d369843a8de675f6cb10d5256d0a'),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'backfill-insight-images',
  '40 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/backfill-insight-images?limit=3',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','78102da0a873fdb0ef66cee2652e7470ee80d369843a8de675f6cb10d5256d0a'),
    body := '{}'::jsonb
  );
  $$
);