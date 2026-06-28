-- Custom SQL migration file, put your code below! --
-- Switch the active dream model to OpenRouter's free auto-router WITHOUT mutating
-- the original catalog row. The model id shipped in 0001 ('baidu/cobuddy:free')
-- is deprecated/unavailable, so generation failed at the provider. ai_models is
-- an immutable catalog: each row records "what that model was", so instead of
-- rewriting 0001's row we add a NEW row and repoint the interpreters at it.
-- (Drizzle migrations are forward-only — there is no down section; a future
-- switch ships as another new row + repoint, never an in-place edit.)

-- 1) Restore the original default-model row to its shipped identity. Corrective
--    for environments where an earlier revision of this migration mutated it in
--    place; a no-op where it still holds the original value.
UPDATE "ai_models"
SET "openrouter_model_id" = 'baidu/cobuddy:free',
    "name" = 'OpenRouter baidu/cobuddy:free'
WHERE "id" = '10000000-0000-4000-8000-000000000001';

-- 2) Add the working free model as a NEW catalog row (immutable; never mutate 0001).
INSERT INTO "ai_models" ("id", "name", "openrouter_model_id", "required_plan", "is_active", "context_length", "price_prompt", "price_completion")
VALUES ('10000000-0000-4000-8000-000000000002', 'OpenRouter openrouter/free', 'openrouter/free', 'FREE', true, 8000, '0', '0')
ON CONFLICT ("id") DO NOTHING;

-- 3) Point every interpreter at the new model so dream generation uses it.
UPDATE "interpreters"
SET "model_id" = '10000000-0000-4000-8000-000000000002'
WHERE "model_id" = '10000000-0000-4000-8000-000000000001';
