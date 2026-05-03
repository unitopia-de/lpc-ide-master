import * as vscode from 'vscode';

const KEY_PREFIX = 'lpc.ftp.password.';

export class CredentialsManager {
    constructor(private readonly secrets: vscode.SecretStorage) {}

    async getPassword(host: string, user: string): Promise<string | undefined> {
        return this.secrets.get(this.key(host, user));
    }

    async setPassword(host: string, user: string, password: string): Promise<void> {
        await this.secrets.store(this.key(host, user), password);
    }

    async deletePassword(host: string, user: string): Promise<void> {
        await this.secrets.delete(this.key(host, user));
    }

    async promptForPassword(host: string, user: string): Promise<string | undefined> {
        const password = await vscode.window.showInputBox({
            prompt: `Passwort für ${user}@${host}`,
            password: true,
            ignoreFocusOut: true
        });
        if (password) {
            await this.setPassword(host, user, password);
        }
        return password;
    }

    private key(host: string, user: string): string {
        return `${KEY_PREFIX}${user}@${host}`;
    }
}
