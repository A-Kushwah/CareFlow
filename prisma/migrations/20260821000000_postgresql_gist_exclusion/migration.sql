-- PostgreSQL GiST Exclusion Constraint Migration for Appointment Overlap Prevention
-- Execute on PostgreSQL production deployments to enforce double-booking prevention at the database engine layer.

-- 1. Enable btree_gist extension required for multi-column GiST exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add GiST Exclusion Constraint to Appointment table
-- Prevents any two overlapping appointments for the same doctor with status HELD or CONFIRMED
ALTER TABLE "Appointment"
ADD CONSTRAINT "no_overlapping_appointments"
EXCLUDE USING gist (
  "doctorId" WITH =,
  tsrange("startTime", "endTime") WITH &&
)
WHERE (status IN ('CONFIRMED', 'HELD'));
