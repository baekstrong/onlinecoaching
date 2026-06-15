-- 코칭 요청 + 종목 분류를 한 트랜잭션에 원자적으로 생성한다.
-- security invoker(기본): 내부 INSERT들에 회원의 RLS가 그대로 적용된다.
-- 분류 INSERT가 RLS에 막히면 함수 전체 트랜잭션이 롤백되어 고아 요청이 남지 않는다.
create or replace function create_coaching_request(
  p_tag_id uuid,
  p_note text,
  p_object_key text
) returns coaching_requests
language plpgsql
security invoker
as $$
declare
  v_req coaching_requests;
begin
  insert into coaching_requests (member_id, member_note, video_object_key, video_uploaded_at)
  values (auth.uid(), p_note, p_object_key, now())
  returning * into v_req;

  insert into request_classifications (request_id, tag_id)
  values (v_req.id, p_tag_id);

  return v_req;
end;
$$;

revoke execute on function create_coaching_request(uuid, text, text) from public;
grant execute on function create_coaching_request(uuid, text, text) to authenticated;
