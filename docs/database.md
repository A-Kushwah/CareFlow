# Database Schema & Storage Strategy

CarePulse utilizes Prisma ORM for relational data modeling with a dual database deployment strategy: **SQLite** for zero-configuration local development and **PostgreSQL** for production environments.

---

## 1. Domain Data Models

```mermaid
erDiagram
    User ||--o| DoctorProfile : "has profile"
    User ||--o{ SlotHold : "holds"
    User ||--o{ Appointment : "books as patient"
    User ||--o{ MedicationReminder : "receives"
    DoctorProfile ||--o{ WorkingHours : "defines"
    DoctorProfile ||--o{ DoctorLeave : "submits"
    DoctorProfile ||--o{ SlotHold : "targets"
    DoctorProfile ||--o{ Appointment : "conducts"
    Appointment ||--o{ MedicationReminder : "originates"

    User {
        string id PK
        string email UK
        string passwordHash
        string name
        string role
        datetime createdAt
    }

    DoctorProfile {
        string id PK
        string userId FK
        string specialty
        float consultFee
        int slotDurationMin
        int bufferTimeMin
    }

    WorkingHours {
        string id PK
        string doctorId FK
        int dayOfWeek
        string startTime
        string endTime
    }

    DoctorLeave {
        string id PK
        string doctorId FK
        datetime startDate
        datetime endDate
        string reason
        string status
    }

    SlotHold {
        string id PK
        string doctorId FK
        string patientId FK
        datetime startTime
        datetime endTime
        datetime expiresAt
    }

    Appointment {
        string id PK
        string patientId FK
        string doctorId FK
        datetime startTime
        datetime endTime
        string status
        string symptoms
        string aiPreSummary
        string consultNotes
        string aiPostSummary
    }

    NotificationLog {
        string id PK
        string idempotencyKey UK
        string recipient
        string channel
        string template
        string payload
        string status
        int attempts
        int maxAttempts
        datetime nextRetryAt
        string claimToken
        datetime claimedAt
        string lastError
    }

    MedicationReminder {
        string id PK
        string patientId FK
        string appointmentId FK
        string medication
        string dosage
        string frequency
        datetime startDate
        datetime endDate
        datetime lastSentAt
        string status
    }
```

---

## 2. Model Specifications

### `User`
- **`id`**: String (UUID, Primary Key)
- **`email`**: String (Unique Index)
- **`passwordHash`**: String (PBKDF2 salted hash)
- **`name`**: String
- **`role`**: Enum (`ADMIN`, `DOCTOR`, `PATIENT`)

### `DoctorProfile`
- **`id`**: String (UUID, Primary Key)
- **`userId`**: String (Foreign Key -> `User.id`, Unique)
- **`specialty`**: String
- **`consultFee`**: Float
- **`slotDurationMin`**: Int (default 30)
- **`bufferTimeMin`**: Int (default 10)

### `SlotHold`
- **`id`**: String (UUID, Primary Key)
- **`doctorId`**: String (Foreign Key -> `DoctorProfile.id`)
- **`patientId`**: String (Foreign Key -> `User.id`)
- **`startTime`**: DateTime
- **`endTime`**: DateTime
- **`expiresAt`**: DateTime (Index for automated cleanup)

### `Appointment`
- **`id`**: String (UUID, Primary Key)
- **`patientId`**: String (Foreign Key -> `User.id`)
- **`doctorId`**: String (Foreign Key -> `DoctorProfile.id`)
- **`startTime`**: DateTime (Compound Index `[doctorId, startTime, endTime]`)
- **`endTime`**: DateTime
- **`status`**: Enum (`HELD`, `CONFIRMED`, `CANCELLED`, `COMPLETED`)
- **`symptoms`**: String (Text)
- **`aiPreSummary`**: String (JSON stringified)
- **`consultNotes`**: String (Text)
- **`aiPostSummary`**: String (JSON stringified)

### `NotificationLog` (Outbox Queue)
- **`id`**: String (UUID, Primary Key)
- **`idempotencyKey`**: String (Unique Index `@unique`)
- **`recipient`**: String
- **`channel`**: Enum (`EMAIL`, `SMS`, `CALENDAR`)
- **`template`**: String
- **`payload`**: String (JSON)
- **`status`**: Enum (`QUEUED`, `PROCESSING`, `SENT`, `FAILED`, `DLQ`)
- **`attempts`**: Int (default 0)
- **`maxAttempts`**: Int (default 5)
- **`nextRetryAt`**: DateTime (Index for worker polling)
- **`claimToken`**: String (Nullable, for atomic worker lease claiming)
- **`claimedAt`**: DateTime (Nullable, for 5-min stale worker lease recovery)
- **`lastError`**: String (Nullable)

---

## 3. Database Engine Deployment Strategy

### Local Development (SQLite)
- Local development uses SQLite (`prisma/dev.db`).
- Double-booking prevention is enforced via two-phase reservation (`SlotHold` + Prisma `$transaction` interactive locks).

### Production Deployment (PostgreSQL)
- Production deployments use PostgreSQL.
- In addition to application-level `$transaction` checks, concurrency is additionally enforced at the database engine level via a GiST exclusion constraint on overlapping appointment time ranges for the same doctor.
- Migration file provided at `prisma/migrations/20260821000000_postgresql_gist_exclusion/migration.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS btree_gist;

  ALTER TABLE "Appointment"
  ADD CONSTRAINT "no_overlapping_appointments"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tsrange("startTime", "endTime") WITH &&
  )
  WHERE (status IN ('CONFIRMED', 'HELD'));
  ```
