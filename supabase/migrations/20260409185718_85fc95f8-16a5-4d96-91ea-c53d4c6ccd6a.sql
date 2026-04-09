
CREATE OR REPLACE FUNCTION public.trigger_send_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Fire async HTTP POST to send-push edge function
  -- Using anon key since the function has verify_jwt = false
  PERFORM net.http_post(
    url := 'https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocGlpbW52a2dtcGZubGRnZGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDI5NTksImV4cCI6MjA4NjcxODk1OX0.-rT23NY6GRn-9Q5cgraDlzu6gazbPj1al8ouvmgZmI4'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'link', NEW.link,
      'type', NEW.type::text
    )
  );

  RETURN NEW;
END;
$function$;
