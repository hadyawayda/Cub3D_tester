const exec = require("util").promisify(require("child_process").exec);
require("dotenv").config();
const { VALGRIND, EXEC, GREP, GREP2 } = process.env;
const { printTitle, printRed, printGreen, printBasic } = require("./utility");
const { parserCount, leaksCount } = require("./report");
const progressBar = require("./progressBar");
const { spawnSync } = require("child_process");

function run(cmd, args = []) {
  return spawnSync(cmd, args, { encoding: "utf-8" });
}

const makeHeader = (file, maps, index) => {
  printTitle(file);
  progressBar.start(maps.length, index + 1);
  printBasic("\n");
};

async function checkParser(file) {
  try {
    const { stdout } = await exec(EXEC + file);
    // if the binary printed “Error\n” to stdout → good for an invalid map
    if (stdout.includes("Error\n")) {
      printBasic(stdout.trim());
      printGreen("[OK]", "PARSER : ");
      parserCount.passed++;
    } else {
      // it exited zero but no “Error\n” → actual parser success on an invalid map
      printRed("[FAILED]", "PARSER :", " expected an error");
      parserCount.failed++;
      parserCount.maps.push(file);
    }
  } catch (err) {
    // err is an object whose `err.code !== 0`
    // treat a non-zero exit as “we got an error”:
    const output = (err.stdout || err.stderr || "").trim();
    printBasic(output);
    printGreen("[OK]", "PARSER : ");
    parserCount.passed++;
  }
}

async function checkLeaks(file) {
  // only run valgrind if parser didn’t fail
  if (parserCount.maps.includes(file)) return;

  // 1) Run valgrind, but swallow any non-zero exit
  try {
    await exec(`${VALGRIND} --log-file=logs/LOG_${file} ${EXEC}${file}`);
  } catch (err) {
    // ignoring: program exit ≠ leak-detection result
  }

  // 2) Now grep for “definitely lost”: exit-0 means “found leaks”
  try {
    const { stdout } = await exec(`${GREP} logs/LOG_${file} ${GREP2}`);
    // grep matched → leaks present
    printBasic(stdout.trim());
    printRed("[FAILED]", "LEAKS  : ");
    leaksCount.failed++;
    leaksCount.maps.push(file);
  } catch (err) {
    // grep exit-1 → no matches → no leaks
    printGreen("[OK]", "LEAKS  : ");
    leaksCount.passed++;
    // clean up the log
    await exec(`rm logs/LOG_${file}`);
  }
}

module.exports = {
  makeHeader,
  checkParser,
  checkLeaks,
};
