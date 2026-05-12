# Deployment

## Cloudflare Pages

1. Push this repository to GitHub.
2. Open Cloudflare Dashboard.
3. Go to `Workers & Pages` -> `Create` -> `Pages`.
4. Choose `Connect to Git`.
5. Select the GitHub repository.
6. Use these settings:

```text
Framework preset: None
Build command: leave empty
Build output directory: /
```

7. Deploy.

## Notes

- This is a static site. No server or build step is required.
- Runtime data is fetched from `https://codexpet.xyz`.
- If the remote API changes, the UI may need to be updated.
