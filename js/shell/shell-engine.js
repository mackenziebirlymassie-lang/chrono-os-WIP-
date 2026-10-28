/**
 * ChronosOS - Interactive Shell Engine
 * Connects the VTY emulator with Command Registry and process pipelines
 */

import { ShellCommandRegistry } from './commands.js';

export class ShellSession {
  constructor(kernel, vty) {
    this.kernel = kernel;
    this.vty = vty;
    this.registry = new ShellCommandRegistry(kernel);
    this.cwd = '/home/user';

    this._bindVTY();
    this._printWelcomeBanner();
  }

  _bindVTY() {
    this.vty.onCommandSubmit = (commandLine) => {
      this._handleCommand(commandLine);
    };
  }

  _printWelcomeBanner() {
    this.vty.writeLine('ChronosOS Quantum Shell (v2.4.0-quantum)');
    this.vty.writeLine('Type "help" for a list of commands, or "neofetch" for system stats.\n');
    this._printPrompt();
  }

  _printPrompt() {
    const prompt = `root@chronos-vm:${this.cwd}# `;
    this.vty.write(prompt);
  }

  _handleCommand(line) {
    if (line.trim().length === 0) {
      this._printPrompt();
      return;
    }

    const context = {
      cwd: this.cwd,
      vty: this.vty,
      session: this,
    };

    const output = this.registry.execute(line, context);
    if (output && output.length > 0) {
      this.vty.writeLine(output);
    }

    this._printPrompt();
  }
}
