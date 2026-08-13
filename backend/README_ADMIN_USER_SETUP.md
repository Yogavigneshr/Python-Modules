# Admin user + lead assignment setup

This workflow requires the `Lead.assigned_to` migration.

From the `backend` directory run:

    python manage.py migrate

Then restart Django.

The admin workflow is superuser-only:
- Users page lists workspace users.
- Create user & assign leads loads existing leads.
- Selected leads are assigned to the new user.
- A temporary password is generated and emailed.
- The account and lead assignments are rolled back if email sending fails.

Configure SMTP in `backend/.env` before sending real email. See `.env.example`.
