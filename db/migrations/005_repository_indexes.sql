CREATE INDEX IF NOT EXISTS memberships_classroom_user_role_idx ON classroom_memberships (classroom_id, user_id, role);
CREATE INDEX IF NOT EXISTS students_user_id_idx ON students (user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_student_status_created_idx ON quiz_attempts (student_id, status, created_at DESC);
