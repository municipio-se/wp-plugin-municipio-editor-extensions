const fs = require("node:fs");
const fixture = JSON.parse(
  fs.readFileSync(process.env.MEE_STAGE_FIXTURE, "utf8"),
);
module.exports = {
  testDir: "./tests/stage",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    baseURL: fixture.admin,
    storageState: { cookies: fixture.cookies, origins: [] },
    httpCredentials: JSON.parse(
      fs.readFileSync(process.env.MEE_STAGE_BASIC, "utf8"),
    ),
  },
};
