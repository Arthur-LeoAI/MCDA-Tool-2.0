# 0003 Stateless API; the server does not store user data

- Status: Accepted (to be reevaluated when M4 introduces user accounts)
- Date: 2026-10-23

## Context

Users often upload their company's business data, such as costs, profits and supplier information. Storing this data brings GDPR obligations (storage, deletion, data processing agreements) and also requires an account and permission system. Until the value of the tool has been validated, this investment is not necessary.

## Decision

- Every request carries the complete problem data; the server discards it after processing and does not write it to disk or a database.
- The data the user is editing is kept in the browser's localStorage. In the MVP, the project can be saved as a file.
- Logs do not record the content of requests and responses (see ADR 0004 and `SECURITY.md`).

## Consequences

- Deployment and compliance are simple, and the service can scale freely.
- There is no cross-device sync and no multi-user collaboration. These are planned for M4, with a new ADR at that time.
- The request body grows with the amount of data, so the API limits the number of alternatives (500) and criteria (200).
