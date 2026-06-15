-- 회원이 '자기 요청'에 '회원 노출 축(예: 운동 종목)'의 태그만 삽입할 수 있도록 허용
create policy "요청분류 생성(회원 종목)" on request_classifications for insert
with check (
  exists (
    select 1 from coaching_requests r
    where r.id = request_id and r.member_id = auth.uid()
  )
  and exists (
    select 1 from classification_tags t
    join classification_axes a on a.id = t.axis_id
    where t.id = tag_id and a.is_member_facing = true
  )
);
