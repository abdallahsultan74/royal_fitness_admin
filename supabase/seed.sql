insert into public.exercises (
  legacy_id,
  name,
  name_ar,
  type,
  target,
  equipment,
  level,
  minutes,
  calories,
  exercise_steps,
  rating,
  source
)
values
  (
    'seed-001',
    'Barbell Bench Press',
    'ضغط البنش بالبار',
    'gym',
    'Chest',
    'Barbell',
    'intermediate',
    12,
    220,
    6,
    4.6,
    'seed'
  ),
  (
    'seed-002',
    'Lat Pulldown',
    'سحب علوي',
    'gym',
    'Back',
    'Cable',
    'beginner',
    10,
    180,
    5,
    4.4,
    'seed'
  ),
  (
    'seed-003',
    'Bodyweight Squat',
    'سكوات وزن الجسم',
    'home',
    'Legs',
    'Bodyweight',
    'beginner',
    8,
    140,
    4,
    4.2,
    'seed'
  )
on conflict do nothing;
