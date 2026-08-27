/**
 * Synchronizes client data and normalized phone numbers.
 * Finds existing client by cedula, or creates a new client.
 * Updates client info (name, last_name, updated_at) if client already exists.
 * Manages normalized phone records in tokki_shop.clients_p_number.
 *
 * @param {object} dbExecutor - pg client or pool with .query(sql, params) method
 * @param {object} clientData
 * @param {string} clientData.cedula - Normalized cedula (e.g. 'V-12345678')
 * @param {string} clientData.name - Client first name
 * @param {string} clientData.last_name - Client last name
 * @param {string} [clientData.phone] - Normalized phone number in E.164 format
 * @param {string} [clientData.tlf_num] - Alternative property for phone number
 * @returns {Promise<number>} client_id
 */
export async function syncClientAndPhone(dbExecutor, { cedula, name, last_name, phone, tlf_num }) {
    const phoneNumber = phone || tlf_num;

    // 1. Check if client exists by cedula
    const clientRes = await dbExecutor.query(
        'SELECT client_id FROM tokki_shop.clients WHERE cedula = $1',
        [cedula]
    );

    let clientId;

    if (clientRes.rows.length === 0) {
        // Insert new client
        const insertClientRes = await dbExecutor.query(
            `INSERT INTO tokki_shop.clients (cedula, name, last_name, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             RETURNING client_id`,
            [cedula, name, last_name]
        );
        clientId = insertClientRes.rows[0].client_id;

        // Insert primary phone
        await dbExecutor.query(
            `INSERT INTO tokki_shop.clients_p_number (client_id, tlf_num, is_primary, last_used_at, created_at)
             VALUES ($1, $2, TRUE, NOW(), NOW())`,
            [clientId, phoneNumber]
        );
    } else {
        clientId = clientRes.rows[0].client_id;

        // Update existing client details
        await dbExecutor.query(
            `UPDATE tokki_shop.clients
             SET name = $1, last_name = $2, updated_at = NOW()
             WHERE client_id = $3`,
            [name, last_name, clientId]
        );

        // Check if phone number is already recorded for this client
        const phoneRes = await dbExecutor.query(
            `SELECT phone_id FROM tokki_shop.clients_p_number
             WHERE client_id = $1 AND tlf_num = $2`,
            [clientId, phoneNumber]
        );

        if (phoneRes.rows.length > 0) {
            // Update last_used_at on existing phone
            await dbExecutor.query(
                `UPDATE tokki_shop.clients_p_number
                 SET last_used_at = NOW()
                 WHERE client_id = $1 AND tlf_num = $2`,
                [clientId, phoneNumber]
            );
        } else {
            // Insert new phone number for this client
            await dbExecutor.query(
                `INSERT INTO tokki_shop.clients_p_number (client_id, tlf_num, is_primary, last_used_at, created_at)
                 VALUES ($1, $2, TRUE, NOW(), NOW())`,
                [clientId, phoneNumber]
            );
        }
    }

    return clientId;
}
