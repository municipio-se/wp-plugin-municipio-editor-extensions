module.exports = {
  testDir: "./tests/browser",
  use: { browserName: "chromium", headless: true },
  workers: 1,
  reporter: "list",
};
