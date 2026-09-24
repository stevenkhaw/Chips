begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  extensions.crypt('x', extensions.gen_salt('bf', 8)) like '$2a$08$%',
  'pgcrypto bcrypt is available in the extensions schema'
);
select ok(
  octet_length(extensions.gen_random_bytes(32)) = 32,
  'gen_random_bytes is available'
);

select * from finish();
rollback;
