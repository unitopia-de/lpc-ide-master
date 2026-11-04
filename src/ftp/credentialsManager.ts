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

    /** Entfernt Passwörter, die frühere Versionen für das automatische MUD-Login gespeichert haben. */
    async deleteOldMudPasswords(muds: ({ host?: string } | undefined)[]): Promise<void> {
        for (const mud of muds) {
            const user = (mud as { user?: unknown } | undefined)?.user;
            if (mud?.host && typeof user === 'string') {
                await this.secrets.delete(this.mudKey(mud.host, user));
            }
        }
    }

    // --- intern -----------------------------------------------------------

    private ftpKey(host: string, user: string): string {
        return `${FTP_PREFIX}${user}@${host}`;
    }

    private mudKey(host: string, user: string): string {
        return `${MUD_PREFIX}${user}@${host}`;
    }
}
