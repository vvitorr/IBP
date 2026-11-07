// Packages the already-built dist/ (see build.mjs). Templates go to Resources/templates outside
// the asar archive because ProjectService copies them with fs.cp.
module.exports = {
  packagerConfig: {
    name: "IBP",
    executableName: "ibp",
    appBundleId: "dev.vvitorr.ibp",
    asar: true,
    prune: false,
    extraResource: ["dist/templates"],
    // Ship only dist/ and package.json (everything is bundled); templates go in via extraResource.
    ignore: (path) =>
      (path !== "" && !/^\/(dist(\/|$)|package\.json$)/.test(path)) ||
      /^\/dist\/templates/.test(path),
  },
  makers: [{ name: "@electron-forge/maker-zip", platforms: ["darwin", "linux", "win32"] }],
};
