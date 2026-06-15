-- 요청당 피드백 1개(upsert 대상)
alter table feedbacks add constraint feedbacks_request_unique unique (request_id);

-- 피드백 첨부는 R2 object key를 저장한다(이미지 URL이 아니라 키 → 표시 시 presign)
alter table feedback_assets rename column image_url to object_key;
