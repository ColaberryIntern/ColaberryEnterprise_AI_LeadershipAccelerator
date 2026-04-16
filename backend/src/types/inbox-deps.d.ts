declare module '@microsoft/microsoft-graph-client' {
  export class Client {
    static init(opts: any): Client;
    static initWithMiddleware(opts: any): Client;
    api(path: string): any;
  }
}

declare module '@azure/msal-node' {
  export class ConfidentialClientApplication {
    constructor(config: any);
    getTokenCache(): any;
    acquireTokenSilent(request: any): Promise<any>;
    acquireTokenByRefreshToken(request: any): Promise<any>;
  }
}
