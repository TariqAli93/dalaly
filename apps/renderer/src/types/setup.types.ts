export type SetupStatus = {
  api_running: boolean;
  app_version?: string;
  db_configured: boolean;
  db_connected: boolean;
  database_exists: boolean;
  migrations_ok: boolean;
  users_table_exists: boolean;
  admin_exists: boolean;
};

export type DatabaseSetupInput = {
  host: string;
  port: string | number;
  adminUsername: string;
  adminPassword: string;
  databaseName: string;
};

export type TestPostgresResult = {
  ok: boolean;
  database_exists: boolean;
};

export type InitializeInput = DatabaseSetupInput & {
  firstAdminUsername: string;
  firstAdminPin: string;
};

export type InitializeResult = {
  ok: boolean;
  database_created: boolean;
  migrations_ok: boolean;
  database_url: string;
  admin: {
    username: string;
    pin: string | null;
  };
};
