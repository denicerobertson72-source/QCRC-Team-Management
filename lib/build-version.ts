export const buildVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_QCRC_BUILD_VERSION ?? "development";
