import * as vscode from 'vscode';

const FTP_PREFIX = 'lpc.ftp.password.';
const MUD_PREFIX = 'lpc.mud.password.';

export class CredentialsManager {
    constructor(private readonly secrets: vscode.SecretStorage) {}

    // --- FTP --------------------------------------------------------------

    async getPassword(host: string, user: string): Promise<string | undefined> {
        return this.secrets.get(this.ftpKey(host, user));
    }

    async setPassword(host: string, user: string, password: string): Promise<void> {
        await this.secrets.store(this.ftpKey(host, user), password);
    }

    async deletePassword(host: string, user: string): Promise<void> {
        await this.secrets.delete(this.ftpKey(host, user));
    }

    async promptForPassword(host: string, user: string): Promise<string | undefined> {
        const password = await vscode.window.showInputBox({
            prompt: `FTP-Passwort für ${user}@${host}`,
            password: true,
            ignoreFocusOut: true
        });
        if (password) {
            await this.setPassword(host, user, password);
        }
        return password;
    }

    // --- MUD (Telnet) -----------------------------------------------------

    async getMudPassword(host: string, user: string): Promise<string | undefined> {
        return this.secrets.get(this.mudKey(host, user));
    }

    async setMudPassword(host: string, user: string, password: string): Promise<void> {
        await this.secrets.store(this.mudKey(host, user), password);
    }

    async deleteMudPassword(host: string, user: string): Promise<void> {
        await this.secrets.delete(this.mudKey(host, user));
    }

    async promptForMudPassword(host: string, user: string): Promise<string | undefined> {
        const password = await vscode.window.showInputBox({
            prompt: `MUD-Passwort für ${user}@${host}`,
            password: true,
            ignoreFocusOut: true
        });
        if (password) {
            await this.setMudPassword(host, user, password);
        }
        return password;
    }

    // --- intern -----------------------------------------------------------

    private ftpKey(host: string, user: string): string {
        return `${FTP_PREFIX}${user}@${host}`;
    }

    private mudKey(host: string, user: string): string {
        return `${MUD_PREFIX}${user}@${host}`;
    }
}
