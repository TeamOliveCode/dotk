import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { keygenCommand } from "./commands/keygen.js";
import { setCommand } from "./commands/set.js";
import { getCommand } from "./commands/get.js";
import { runCommand } from "./commands/run.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { diffCommand } from "./commands/diff.js";
import { exportCommand } from "./commands/export.js";
import { uiCommand } from "./commands/ui.js";

const program = new Command();

program
  .name("dotk")
  .description("Secure secret management backed by GitHub Private Repos")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(keygenCommand);
program.addCommand(setCommand);
program.addCommand(getCommand);
program.addCommand(runCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(diffCommand);
program.addCommand(exportCommand);
program.addCommand(uiCommand);

program.parse();
