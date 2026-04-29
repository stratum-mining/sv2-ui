# Monitoring API Compatibility

`sv2-ui` consumes monitoring APIs exposed by `sv2-apps` containers, currently JD Client (JDC) and Translator Proxy (tProxy).

These APIs may still be considered unstable on the `sv2-apps` side. Because of that, `sv2-ui` must not assume that every supported `sv2-apps` image exposes the same raw monitoring schema.

This matters especially because `sv2-ui` may intentionally run older JDC/tProxy images when users are running older Bitcoin Core versions. For example, a user on Bitcoin Core 30.2 may require an older JDC image, while a user on Bitcoin Core 31.0 may require a newer one. Both setups may need to be supported by the same `sv2-ui` release.

## Compatibility Profiles

`sv2-ui` should select `sv2-apps` image versions through runtime compatibility profiles.

Each profile should describe:

- supported Bitcoin Core version/range
- JDC image tag
- Translator Proxy image tag
- expected monitoring API contract for each app
- optional monitoring features available for that image set

## Handling API Changes

When `sv2-apps` changes a monitoring API, `sv2-ui` should classify the change before updating the dashboard.

### Backward-Compatible Additions

Examples:

- new optional field
- new endpoint
- new optional detail beside an existing field

Action in `sv2-ui`:

- no change if unused
- optional UI enhancement if useful
- field-presence check is usually enough

### Breaking Changes

Examples:

- field removed
- field renamed
- field type changed
- field meaning or unit changed
- endpoint removed or response shape changed

Action in `sv2-ui`:

- update the compatibility profile for the affected image
- add or update backend normalization if the frontend needs a stable shape
- add fixture tests using payloads from the affected image versions

## Frontend Rule

The React frontend should avoid depending on version-specific raw JDC/tProxy response shapes when multiple supported images differ.

If a raw API difference affects data already shown by the dashboard, normalize it in the `sv2-ui` backend or shared monitoring layer first.

If a future image exposes new monitoring data that older images do not have, treat it as an optional feature and render it only for compatible profiles.