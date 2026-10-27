# 0004 Versioned API, errors expressed as codes

- Status: Accepted
- Date: 2026-10-23

## Context

The original API returned English error sentences directly, which the frontend could not translate into Chinese or German. The paths also had no version number, so later interface changes would directly affect existing clients. The frontend types were generated from a running server and were easy to forget to update.

## Decision

1. **Version number**: all endpoints are under `/api/v1`. For breaking changes, a new `/api/v2` is added, and the old version is kept for a transition period.
2. **Error format**: all errors return `{code, detail, params, issues, request_id}`.
   - Each issue contains `code`, `params`, a structured `location` (`cell`, `alternative`, `criterion`, `value`, `row`, `field`) and an English `message`;
   - Error codes are listed centrally in `mcda_core/errors.py`, and clients translate by code;
   - A frontend test ensures that every error code has a Chinese and an English translation.
3. **API contract file**: `backend/openapi.json` is exported directly from the application code, without starting the server; the frontend TypeScript types are generated from it. CI checks that both are up to date.
4. **Request ID**: every request has an `X-Request-ID`, which is included in the response headers, error responses and logs. Logs do not record business data.

## Consequences

- Adding a new error requires changes in two places: the backend error code and the frontend translation. If one is missed, the tests fail.
- Once released, error codes must stay stable; they are effectively part of the public interface.
- Frontend and backend data structures cannot silently drift apart.
