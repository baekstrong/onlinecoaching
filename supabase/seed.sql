-- 분류 축
insert into classification_axes (name, is_member_facing, allow_multiple, sort_order) values
  ('운동 종목', true,  false, 1),
  ('문제 유형', false, true,  2),
  ('신체 부위', false, true,  3),
  ('회원 수준', false, false, 4);

-- 분류 값
insert into classification_tags (axis_id, label, sort_order)
select a.id, t.label, t.ord
from classification_axes a
join (values
  ('운동 종목','스쿼트',1),('운동 종목','데드리프트',2),('운동 종목','벤치프레스',3),
  ('운동 종목','푸시업',4),('운동 종목','런지',5),('운동 종목','플랭크',6),
  ('문제 유형','무릎 모임',1),('문제 유형','허리 말림',2),('문제 유형','가동범위 부족',3),
  ('문제 유형','중심 불안정',4),('문제 유형','속도 과다',5),
  ('신체 부위','무릎',1),('신체 부위','허리',2),('신체 부위','어깨',3),
  ('신체 부위','고관절',4),('신체 부위','발목',5),
  ('회원 수준','초급',1),('회원 수준','중급',2),('회원 수준','고급',3)
) as t(axis_name, label, ord) on a.name = t.axis_name;
