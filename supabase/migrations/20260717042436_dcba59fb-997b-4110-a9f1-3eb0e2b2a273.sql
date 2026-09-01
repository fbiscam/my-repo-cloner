-- Requeue founding/doc emails from DLQ so they retry with the empty-text fallback fix.
DO $$
DECLARE _row record;
BEGIN
  FOR _row IN
    SELECT msg_id, message
    FROM pgmq.q_transactional_emails_dlq
    WHERE message->>'label' LIKE 'founding-%'
  LOOP
    IF (_row.message->>'text') IS NULL OR length(trim(_row.message->>'text')) = 0 THEN
      PERFORM pgmq.send(
        'transactional_emails',
        _row.message || jsonb_build_object(
          'text',
          trim(regexp_replace(
            regexp_replace(
              regexp_replace(_row.message->>'html', '<style[^<]*</style>', '', 'gi'),
              '<[^>]+>', ' ', 'g'
            ),
            '\s+', ' ', 'g'
          ))
        )
      );
    ELSE
      PERFORM pgmq.send('transactional_emails', _row.message);
    END IF;
    PERFORM pgmq.delete('transactional_emails_dlq', _row.msg_id);
  END LOOP;
END $$;