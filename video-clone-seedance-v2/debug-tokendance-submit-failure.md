# Debug Session: tokendance-submit-failure
- **Status**: [OPEN]
- **Issue**: TokenDance accepts generation jobs then returns TaskSubmitFailed ("构建提交请求失败").
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-tokendance-submit-failure.ndjson

## Reproduction Steps
1. Examine existing failed tasks, including `tokendance:01M4JD72MMP7HCK940D82VZWT0`, without creating a new paid job.
2. If necessary, capture a subsequent user-initiated task with sanitized request/response instrumentation.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | TokenDance cannot fetch one or more supplied media URLs from its downstream channel | High | Low | Confirmed by the latest nested `material_source_unavailable`/TOS deadline error; the failing URL is not identified |
| B | Request fields or media roles are incompatible | Low | Medium | No evidence: debug log lines 2-3 match documented roles and fields; latest error specifically names a media download |
| C | Reference media is corrupt, truncated, or has incorrect MIME | Low | Medium | Earlier MIME bug fixed; fresh mirrors of the latest four local files each returned full matching bytes and correct MIME from this server, but the exact task URLs were not retained |
| D | TokenDance's downstream task builder fails after accepting the task | High | Low | Confirmed: accepted task later failed in channel `mc006` while creating a replica asset |
| E | COS URL expired or was inaccessible when the channel fetched it | Low | Medium | Inconclusive: COS signs GET URLs for 24 hours; exact submitted URLs are kept only in process memory and cannot be recovered from task logs; provider-side access is not observable |

## Log Evidence
- Existing backend log: task `01M4JB3Y0B3RZCQ8XPTSEYDBJM` was queued, then failed with `TaskSubmitFailed` after ~28 seconds. Previous task `01M4JARTV77YDBWY0QYAJMRQXT` behaved identically.
- Read-only polling of both tasks returned HTTP 200 with `{status:"failed",error:{code:"TaskSubmitFailed",message:"构建提交请求失败"}}` and no additional diagnosis.
- Both attempts used the same silent H.264 1080x1920 video (4.4 seconds, 5,080,187 bytes); COS mirroring reported success for images and video in the second attempt.
- Both images named `i3.png` and `i4.png` have JPEG/JFIF bytes. The uploader trusts the supplied Content-Type and COS mirrors that same type; verify the actual recorded Content-Type before treating this as the cause.
- Diagnostic-only instrumentation added to `server/tokendance.ts` for media hosts, request shape, accepted ID, and terminal error. No generation behavior changed.
- `.dbg/trae-debug-log-tokendance-submit-failure.ndjson:1`: existing task read-only polling reported `TaskSubmitFailed`, status `failed`; no further details.
- `server/localAssets.ts` infers saved asset MIME from extension; `i3.png` and `i4.png` therefore reach COS as `image/png` even though both files have JPEG/JFIF bytes.
- Post-fix `.dbg/trae-debug-log-tokendance-submit-failure.ndjson:1`: a COS GET of corrected legacy `i4.png` succeeded with HTTP 206, MIME `image/jpeg`, `.jpg` object extension, and `ffd8ffe0` JPEG signature. A HEAD request returned 403, so use GET for accessibility checks.
- Post-fix `.dbg/trae-debug-log-tokendance-submit-failure.ndjson:2-5`: submitted two COS `reference_image` URLs and one COS `reference_video`, 720p/4s/9:16, accepted ID `01M4JBV4VKQYG7JG4P7D2X0CQ7`; ~28s later status failed with `TaskSubmitFailed` and no detailed reason.
- Separate ranged GET of a COS mirror of the post-fix silent reference video returned HTTP 206, `video/mp4`, and an MP4 `ftypisom` header.
- User reports no request record at all in the TokenDance console for the same account that issued `TOKENDANCE_KEY`. This is not independently verifiable through the public task API; it strengthens the gateway/submission-stage hypothesis.
- Latest task `tokendance:01M4JD72MMP7HCK940D82VZWT0`: `logs/video-clone-seedance-v2.log:49-53` confirms three COS images (`i4.jpg`, `i5.jpg`, `ref1.png`) and one silent COS video (`silent_5f6ea9f3-1caf-4603-a998-9d728714ee04.mp4`) before acceptance. Line 113 reports `TaskSubmitFailed` with nested `material_source_unavailable`: channel `mc006` failed to download a provided URL, TOS `read body err:context deadline exceeded`, RequestID `827607c9f0a8947f6ac9f0a8-b5d66ca-1xFS0W-FO-cb-tos-3az-front-aza-6`. The response gives neither the asset index nor the failing URL.
- The COS service (`moduls/api-manager/backend/internal/service/cos_asset_service.go`) issues 24-hour signed GET URLs for uploads in the configured bucket. The app caches them in memory keyed by local path but does not persist the exact submitted URLs; the old task's links cannot be independently reconstructed from the available logs.
- Diagnostic-only repeat uploads of the latest four local reference files, followed by full-body GETs of newly signed COS URLs from this server, each returned HTTP 200, the expected MIME and length, and a SHA-256 match. `i4.jpg`: 482763 bytes/103 ms; `i5.jpg`: 463116 bytes/86 ms; `ref1.png`: 1841576 bytes/83 ms; silent MP4: 4006165 bytes/118 ms. These are **new mirrors**, not the exact task URLs and not a download from `mc006`. No new generation was submitted.
- TokenDance's documented reference-media API takes external URLs. No supported direct TokenDance/TOS media-upload integration was found in this repository or the consulted generation protocol docs; the configured COS bucket is `ap-guangzhou`, and no alternative-region storage was established.

## Verification Conclusion
The latest nested error identifies the failure stage: TokenDance accepted the task, then its `mc006` channel timed out reading reference media while creating a TOS replica. It does **not** identify which reference or prove whether the failure is intermittent COS access, channel networking, or a provider deadline. Earlier local MIME normalization was valid but not sufficient: pre-fix task `01M4JB3Y0B3RZCQ8XPTSEYDBJM` and post-fix task `01M4JBV4VKQYG7JG4P7D2X0CQ7` both failed. Fresh full downloads pass locally, so there is no verified app-side fix or pre/post-fix provider proof yet. Ask TokenDance support to trace task `01M4JD72MMP7HCK940D82VZWT0` and the TOS RequestID above, identify the failing media URL/asset index and the download deadline, and explain why the task is absent from the user's console history. Keep instrumentation and this record until user confirms resolution or aborts debugging.
