# Multi-DRM setup

Integration is prepared but disabled. No DRM subscription, encryption service, keys, or licenses are provisioned by this code. Existing MP4/embed sources remain unprotected by DRM. Switching a title to `drm` never falls back to a clear source.

## Provider requirements

Choose a provider/gateway for Widevine, PlayReady, and FairPlay. Package each title/episode into encrypted DASH (Widevine/PlayReady) and encrypted HLS (FairPlay). The packager and license service must share matching content keys and asset IDs. Serve manifests, segments, and subtitles over HTTPS with browser CORS access. Keep original unencrypted masters private; remove public links to them. If the CDN requires signed URLs/cookies, add the provider-specific signing integration before release. This integration does not create CDN tokens.

Configure provider policies to use temporary, short-lived, renewing licenses, deny persistence/offline use, and enforce appropriate output protection/security levels. License issuance must verify that challenge KIDs belong to the asset ID in the gateway URL. An authorized subscriber must never be able to request keys for arbitrary assets by modifying a challenge. A generic global license URL that ignores asset IDs is not sufficient.

## Server configuration

Set these in `apps/api/.env` and restart the API:

```dotenv
DRM_ENABLED=true
DRM_WIDEVINE_LICENSE_URL=https://your-gateway.example/widevine/{assetId}
DRM_PLAYREADY_LICENSE_URL=https://your-gateway.example/playready/{assetId}
DRM_FAIRPLAY_LICENSE_URL=https://your-gateway.example/fairplay/{assetId}
DRM_FAIRPLAY_CERTIFICATE_URL=https://your-gateway.example/fairplay/certificate.der
DRM_LICENSE_AUTHORIZATION=Bearer your-server-only-gateway-secret
```

These are placeholders, not a working provider. All three systems and the FairPlay certificate are required before the integration reports ready. The gateway URL templates require `{assetId}` and HTTPS. Redirects are rejected. The server forwards only the configured Authorization header and the raw browser challenge; it never forwards viewer cookies. Gateway responses must be raw binary. Widevine accepts its native challenge, PlayReady receives the native challenge/XML bytes with octet-stream content type, and FairPlay accepts raw SPC and returns raw CKC. Provider-specific JSON, form encoding, token signing, or base64 wrappers must be implemented in the gateway/adapter. The public DER FairPlay certificate endpoint must accept GET without Authorization. No secret gateway values are returned to the player.

FairPlay uses modern EME and the manifest's standard `skd://` content signaling. A provider needing custom content ID derivation or legacy Apple Media Keys needs an additional adapter based on the provider's documented contract. Apple credentials/certificates must be obtained through the provider/Apple; none are generated here.

## Configure titles

In the admin film editor choose **Embed / URL Stream**, then **Protected streaming (Multi-DRM)**. Put the encrypted DASH manifest in Video Stream URL, set the DRM asset ID, and set the FairPlay encrypted HLS manifest URL. Episodes have the same DRM provider and fields in their editor. Each episode needs its own matching asset ID. These changes do not encrypt uploads. Leave DRM off for a title until encrypted content is ready.

## Access and playback

`/api/playback/:slug/config`, `/certificate`, and `/license/:system` recheck the session and CinePass access on every request. Viewer access also requires an unexpired active subscription record linked by `viewerId`. Active admins retain preview access. Published content is selected by slug; episodes must belong to that series. License challenges are limited to 256 KB and upstream bodies to 1 MB. License/CDN requests must be served over HTTPS in production. Configure the reverse proxy to enforce per-account/IP request limits.

Shaka negotiates the supported key system. FairPlay-capable browsers receive the HLS source; other browsers receive DASH. Player errors do not fall back to MP4, iframe, or ClearKey. A loaded title must report an active EME key system before it becomes visible. Privacy shield behavior remains available as an additional deterrent.

## Validation before enabling production

Run `npm run build` and `node --import tsx --test apps/api/tests/drm.test.ts`. Test real licensed playback with the chosen provider on current Chrome, Edge, Firefox, and Safari, including subscription expiry, renewal, wrong assets, revoked access, FairPlay certificate/content ID handling, and output-protection failure. Test actual screen capture tools across the intended OS/hardware matrix. Mocked tests cannot certify DRM playback or black-frame recording behavior. No browser-wide or device-wide screenshot blocking guarantee is made.

References: [Shaka DRM configuration](https://shaka-project.github.io/shaka-player/docs/api/tutorial-drm-config.html), [FairPlay integration](https://shaka-project.github.io/shaka-player/docs/api/tutorial-fairplay.html).

## Direct Axinom adapter

Set `DRM_PROVIDER=axinom` to use the tenant-specific `AXINOM_WIDEVINE_LICENSE_URL`, `AXINOM_PLAYREADY_LICENSE_URL`, and `AXINOM_FAIRPLAY_LICENSE_URL` endpoints directly. Set `AXINOM_COMMUNICATION_KEY_ID` and the base64 `AXINOM_COMMUNICATION_KEY` on the server. Unlike gateway mode, these URLs do not use `{assetId}` and no generic gateway Authorization header is sent. The backend signs an HS256 License Service Message valid for two minutes and sends it as `X-AxDRM-Message` only to the upstream service after verifying access. Tokens grant only the single encoded content key ID saved for the title/episode; no allow-all entitlement is used. The DRM asset ID field must contain the encoded video's content key ID (KID), not its Mosaic video ID or the communication key ID. This adapter supports the Single Key processing profile; multi-key encoding requires extending the title configuration with all track KIDs.

Set `DRM_FAIRPLAY_CERTIFICATE_URL` to the public DER certificate belonging to the tenant's FairPlay dataset. Use the trial certificate only for evaluation. The existing DASH/HLS fields still need the actual encrypted manifest URLs from the encoded video's output. Keep `DRM_ENABLED=false` until those are available and configured. Token expiration limits license issuance, not the duration/output-protection policy of an already-issued license; configure license policies in Axinom before production.

References: [Axinom signing](https://docs.axinom.com/services/drm/license-service/sign-license-service-message), [License Service Message](https://docs.axinom.com/services/drm/license-service/license-service-message).
