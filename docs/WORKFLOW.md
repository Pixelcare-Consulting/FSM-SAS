# SAS-FSM Project Workflow Guide

## Table of Contents
- [Branch Strategy](#branch-strategy)
- [Development Workflow](#development-workflow)
- [Deployment Process](#deployment-process)
- [Code Review Guidelines](#code-review-guidelines)
- [CI/CD Pipeline](#cicd-pipeline)
- [Best Practices](#best-practices)
- [Job Completed Email (Mobile / Webhook)](#job-completed-email-mobile--webhook)
- [Troubleshooting](#troubleshooting)

## Branch Strategy

### Core Branches
- **main**
  - Production-ready code
  - Protected branch
  - Requires pull request and approval
  - Tagged with version numbers

- **develop**
  - Integration branch for features
  - Base branch for feature development
  - Continuously deployed to development environment

### Supporting Branches
- **feature/***
  - Purpose: New features and non-emergency changes
  - Branch from: develop
  - Merge to: develop
  - Naming: `feature/feature-name`

- **bugfix/***
  - Purpose: Bug fixes for development
  - Branch from: develop
  - Merge to: develop
  - Naming: `bugfix/bug-description`

- **hotfix/***
  - Purpose: Emergency production fixes
  - Branch from: main
  - Merge to: main and develop
  - Naming: `hotfix/issue-description`

- **release/***
  - Purpose: Release preparation
  - Branch from: develop
  - Merge to: main and develop
  - Naming: `release/vX.Y.Z`

## Development Workflow

### Starting New Work
1. Update develop branch
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. Create feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Daily Development
1. Keep your branch updated
   ```bash
   git pull origin develop
   ```

2. Make your changes and commit
   ```bash
   git add .
   git commit -m "type: description"
   ```

3. Push changes
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format
```
type: subject

body (optional)
```

Types:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation
- **style**: Code style changes
- **refactor**: Code refactoring
- **test**: Testing changes
- **chore**: Maintenance tasks

## Deployment Process

### Environment Stages

1. **Development**
   - Branch: develop
   - Deployment: Automatic
   - Purpose: Integration testing
   - URL: dev.example.com

2. **Staging**
   - Branch: release/*
   - Deployment: Manual
   - Purpose: UAT and final testing
   - URL: staging.example.com

3. **Production**
   - Branch: main
   - Deployment: Manual with approval
   - Purpose: Live environment
   - URL: www.example.com

### Release Process
1. Create release branch
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b release/vX.Y.Z
   ```

2. Deploy to staging and test

3. Merge to main
   ```bash
   git checkout main
   git merge release/vX.Y.Z --no-ff
   git tag vX.Y.Z
   git push origin main --tags
   ```

## Code Review Guidelines

### Pre-submission Checklist
- [ ] Run all tests
- [ ] Update documentation
- [ ] Follow code style guidelines
- [ ] Self-review changes
- [ ] Check for security implications

### Review Process
1. Create pull request to develop
2. Fill PR template
3. Request minimum 2 reviewers
4. Address review comments
5. Get final approval
6. Squash and merge

### Review Focus Areas
- Code functionality
- Test coverage
- Documentation
- Performance
- Security
- Code style
- Error handling

## CI/CD Pipeline

### Automated Checks
- Unit tests
- Integration tests
- Code style validation
- Security scanning
- Build verification
- Performance tests

### Pipeline Stages
1. **Build**
   - Compile code
   - Run unit tests
   - Generate artifacts

2. **Test**
   - Run integration tests
   - Perform security scans
   - Check code coverage

3. **Deploy**
   - Deploy to environment
   - Run smoke tests
   - Monitor deployment

## Best Practices

### Branch Management
1. Regular updates
   ```bash
   git fetch origin
   git rebase origin/develop
   ```

2. Clean up old branches
   ```bash
   git branch -d feature/old-feature
   ```

### Code Quality
- Write clear comments
- Follow coding standards
- Include unit tests
- Document API changes
- Keep commits focused

### Security
- No secrets in code
- Regular dependency updates
- Security scanning
- Access control review
- Audit logging

## Job Completed Email (Mobile / Webhook)

When a technician signs off on mobile, the app writes directly to Supabase (`job_signatures`, `technician_jobs`). The portal does **not** automatically receive those writes — something must call the completion email endpoint.

### Endpoint

`POST /api/jobs/[jobId]/technician-complete`

- **Auth:** logged-in session (`uid` + `sessionId` cookies), same as other portal APIs.
- **When to call:** after mobile inserts `job_signatures` or sets `technician_jobs.assignment_status` to `COMPLETED`.
- **Behavior:**
  - Verifies sign-off (signature row, completed assignment, or job already in a complete SAP/text status).
  - Sets `jobs.status` to `-1` (Job Done) if still open.
  - Sends the job-completed notification email once per job (dedupe via `job_email_log`).

### Mobile app integration

After a successful sign-off save to Supabase, POST to:

```
POST /api/jobs/{jobId}/technician-complete
```

No body required. Handle `200` with `{ skipped: true, reason: "..." }` as non-fatal (e.g. `email_already_sent`, `toggle_off`, `no_customer_email`).

### Supabase Database Webhook (alternative)

If the mobile app cannot call the portal API immediately:

1. In Supabase Dashboard → Database → Webhooks, create a webhook on **`job_signatures` INSERT**.
2. Target URL: `https://<portal-host>/api/jobs/[jobId]/technician-complete` — use an Edge Function or middleware to map `record.technician_job_id` → `job_id` if the webhook payload does not include `job_id` directly.
3. Forward session cookies or use a service-to-service secret (not yet implemented; prefer mobile POST with technician session).

### Server-side paths (no extra call needed)

- **Edit Job save:** `jobService.update` sends completion email when `jobs.status` transitions to a complete status (`-1`, `572`, `611`, or text containing `COMPLET`).
- **Legacy client:** Edit Job also calls `POST /api/email/job-completed` as a fallback; dedupe prevents double send.

### Database migration

Apply `lib/supabase/migrations/create_job_email_log_table.sql` so duplicate completion emails are suppressed across Edit Job, `jobService.update`, and technician sign-off.

## Troubleshooting

### Common Issues
1. **Merge Conflicts**
   - Pull latest changes
   - Resolve conflicts locally
   - Test after resolution
   - Push changes

2. **Build Failures**
   - Check build logs
   - Run tests locally
   - Verify dependencies
   - Check environment variables

### Getting Help
1. Check documentation
2. Ask team members
3. Create GitHub issue
4. Update wiki/docs

### Support Channels
- Team chat: #team-dev
- Documentation: /docs
- Issue tracker: GitHub Issues
- Wiki: /wiki