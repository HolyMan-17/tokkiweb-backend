import { describe, expect, test, jest } from '@jest/globals';
import { syncClientAndPhone } from '../src/utils/clientSync.js';

describe('syncClientAndPhone', () => {
    describe('new client creation', () => {
        test('inserts client and primary phone number, then returns client_id', async () => {
            const executedQueries = [];
            const mockDb = {
                query: jest.fn(async (sql, params) => {
                    executedQueries.push({ sql: sql.trim(), params });

                    // 1. SELECT client by cedula -> not found
                    if (sql.includes('SELECT') && sql.includes('clients') && sql.includes('cedula')) {
                        return { rows: [] };
                    }
                    // 2. INSERT into clients -> returns new client_id
                    if (sql.includes('INSERT INTO') && sql.includes('clients') && !sql.includes('clients_p_number')) {
                        return { rows: [{ client_id: 42 }] };
                    }
                    // 3. INSERT into clients_p_number
                    if (sql.includes('INSERT INTO') && sql.includes('clients_p_number')) {
                        return { rows: [{ phone_id: 1 }] };
                    }
                    throw new Error(`Unexpected query: ${sql}`);
                })
            };

            const result = await syncClientAndPhone(mockDb, {
                cedula: 'V-12345678',
                name: 'Maria',
                last_name: 'Perez',
                phone: '+584141234567'
            });

            expect(result).toBe(42);
            expect(mockDb.query).toHaveBeenCalledTimes(3);

            // Verify select by cedula
            expect(executedQueries[0].sql).toMatch(/SELECT.*FROM tokki_shop\.clients.*WHERE.*cedula/is);
            expect(executedQueries[0].params).toEqual(['V-12345678']);

            // Verify client insert
            expect(executedQueries[1].sql).toMatch(/INSERT INTO tokki_shop\.clients/i);
            expect(executedQueries[1].params).toEqual(['V-12345678', 'Maria', 'Perez']);

            // Verify phone insert
            expect(executedQueries[2].sql).toMatch(/INSERT INTO tokki_shop\.clients_p_number/i);
            expect(executedQueries[2].params).toEqual([42, '+584141234567']);
        });
    });

    describe('existing client with same phone', () => {
        test('updates client details, updates phone last_used_at, and returns client_id', async () => {
            const executedQueries = [];
            const mockDb = {
                query: jest.fn(async (sql, params) => {
                    executedQueries.push({ sql: sql.trim(), params });

                    // 1. SELECT client by cedula -> found existing client
                    if (sql.includes('SELECT') && sql.includes('clients') && sql.includes('cedula')) {
                        return { rows: [{ client_id: 10 }] };
                    }
                    // 2. UPDATE clients
                    if (sql.includes('UPDATE') && sql.includes('clients') && !sql.includes('clients_p_number')) {
                        return { rows: [{ client_id: 10 }] };
                    }
                    // 3. SELECT phone in clients_p_number -> found
                    if (sql.includes('SELECT') && sql.includes('clients_p_number')) {
                        return { rows: [{ phone_id: 5 }] };
                    }
                    // 4. UPDATE clients_p_number last_used_at
                    if (sql.includes('UPDATE') && sql.includes('clients_p_number')) {
                        return { rows: [{ phone_id: 5 }] };
                    }
                    throw new Error(`Unexpected query: ${sql}`);
                })
            };

            const result = await syncClientAndPhone(mockDb, {
                cedula: 'V-12345678',
                name: 'Maria Updated',
                last_name: 'Perez Gomez',
                phone: '+584141234567'
            });

            expect(result).toBe(10);
            expect(mockDb.query).toHaveBeenCalledTimes(4);

            // Verify select by cedula
            expect(executedQueries[0].params).toEqual(['V-12345678']);

            // Verify client update
            expect(executedQueries[1].sql).toMatch(/UPDATE tokki_shop\.clients\s+SET/i);
            expect(executedQueries[1].params).toEqual(['Maria Updated', 'Perez Gomez', 10]);

            // Verify phone check
            expect(executedQueries[2].sql).toMatch(/SELECT.*FROM tokki_shop\.clients_p_number.*WHERE.*client_id.*tlf_num/is);
            expect(executedQueries[2].params).toEqual([10, '+584141234567']);

            // Verify phone update
            expect(executedQueries[3].sql).toMatch(/UPDATE tokki_shop\.clients_p_number\s+SET.*last_used_at/is);
            expect(executedQueries[3].params).toEqual([10, '+584141234567']);
        });
    });

    describe('existing client with new/different phone', () => {
        test('updates client details, inserts new phone into clients_p_number, and returns client_id', async () => {
            const executedQueries = [];
            const mockDb = {
                query: jest.fn(async (sql, params) => {
                    executedQueries.push({ sql: sql.trim(), params });

                    // 1. SELECT client by cedula -> found existing client
                    if (sql.includes('SELECT') && sql.includes('clients') && sql.includes('cedula')) {
                        return { rows: [{ client_id: 15 }] };
                    }
                    // 2. UPDATE clients
                    if (sql.includes('UPDATE') && sql.includes('clients') && !sql.includes('clients_p_number')) {
                        return { rows: [{ client_id: 15 }] };
                    }
                    // 3. SELECT phone in clients_p_number -> NOT found
                    if (sql.includes('SELECT') && sql.includes('clients_p_number')) {
                        return { rows: [] };
                    }
                    // 4. INSERT INTO clients_p_number
                    if (sql.includes('INSERT INTO') && sql.includes('clients_p_number')) {
                        return { rows: [{ phone_id: 8 }] };
                    }
                    throw new Error(`Unexpected query: ${sql}`);
                })
            };

            const result = await syncClientAndPhone(mockDb, {
                cedula: 'V-87654321',
                name: 'Carlos',
                last_name: 'Rodriguez',
                phone: '+584129876543'
            });

            expect(result).toBe(15);
            expect(mockDb.query).toHaveBeenCalledTimes(4);

            // Verify client update
            expect(executedQueries[1].sql).toMatch(/UPDATE tokki_shop\.clients/i);
            expect(executedQueries[1].params).toEqual(['Carlos', 'Rodriguez', 15]);

            // Verify phone lookup
            expect(executedQueries[2].params).toEqual([15, '+584129876543']);

            // Verify new phone insert
            expect(executedQueries[3].sql).toMatch(/INSERT INTO tokki_shop\.clients_p_number/i);
            expect(executedQueries[3].params).toEqual([15, '+584129876543']);
        });
    });

    describe('SQL parameterization & injection prevention', () => {
        test('passes potential SQL injection payloads purely as bind parameters', async () => {
            const executedQueries = [];
            const mockDb = {
                query: jest.fn(async (sql, params) => {
                    executedQueries.push({ sql, params });
                    if (sql.includes('SELECT') && sql.includes('clients') && sql.includes('cedula')) {
                        return { rows: [] };
                    }
                    if (sql.includes('INSERT INTO') && sql.includes('clients') && !sql.includes('clients_p_number')) {
                        return { rows: [{ client_id: 99 }] };
                    }
                    if (sql.includes('INSERT INTO') && sql.includes('clients_p_number')) {
                        return { rows: [{ phone_id: 1 }] };
                    }
                    return { rows: [] };
                })
            };

            const maliciousPayload = {
                cedula: "V-12345678' OR '1'='1",
                name: "Robert'); DROP TABLE tokki_shop.clients;--",
                last_name: "Smith' --",
                phone: "+584141112233'; SELECT * FROM users;--"
            };

            await syncClientAndPhone(mockDb, maliciousPayload);

            for (const { sql, params } of executedQueries) {
                // Ensure SQL text contains NO unescaped literal injection fragments
                expect(sql).not.toContain("DROP TABLE");
                expect(sql).not.toContain("' OR '1'='1");
                expect(sql).not.toContain("SELECT * FROM users");
                // Ensure all variables were passed via params array
                expect(Array.isArray(params)).toBe(true);
            }

            expect(executedQueries[0].params).toEqual([maliciousPayload.cedula]);
            expect(executedQueries[1].params).toEqual([
                maliciousPayload.cedula,
                maliciousPayload.name,
                maliciousPayload.last_name
            ]);
            expect(executedQueries[2].params).toEqual([
                99,
                maliciousPayload.phone
            ]);
        });

        test('accepts tlf_num property as alternative to phone', async () => {
            const mockDb = {
                query: jest.fn(async (sql) => {
                    if (sql.includes('SELECT') && sql.includes('clients') && sql.includes('cedula')) {
                        return { rows: [] };
                    }
                    if (sql.includes('INSERT INTO') && sql.includes('clients') && !sql.includes('clients_p_number')) {
                        return { rows: [{ client_id: 50 }] };
                    }
                    if (sql.includes('INSERT INTO') && sql.includes('clients_p_number')) {
                        return { rows: [{ phone_id: 1 }] };
                    }
                    return { rows: [] };
                })
            };

            const result = await syncClientAndPhone(mockDb, {
                cedula: 'V-11223344',
                name: 'Ana',
                last_name: 'Torres',
                tlf_num: '+584145556677'
            });

            expect(result).toBe(50);
            expect(mockDb.query).toHaveBeenLastCalledWith(
                expect.stringMatching(/INSERT INTO tokki_shop\.clients_p_number/i),
                [50, '+584145556677']
            );
        });
    });
});
