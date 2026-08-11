CREATE UNIQUE INDEX IF NOT EXISTS student_claim_token_hash_idx ON student_claim_tokens (token_hash);
CREATE INDEX IF NOT EXISTS student_claim_student_idx ON student_claim_tokens (student_id);
CREATE INDEX IF NOT EXISTS student_claim_expiry_idx ON student_claim_tokens (expires_at);
