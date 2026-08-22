import { getAuth, clerkClient } from '@clerk/express';

const ALLOWED_ROLES = ['owner', 'tech'];
const ROLE_TO_USER_TYPE = {
    owner: 'shop_owner',
    tech: 'tech_admin'
};

export const requireAdmin = async (req, res, next) => {
    try {
        const { userId } = getAuth(req);

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const user = await clerkClient.users.getUser(userId);
        const role = user.publicMetadata?.role;

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
        }

        req.adminUser = {
            clerk_user_id: userId,
            email: user.primaryEmailAddress?.emailAddress ?? '',
            user_type: ROLE_TO_USER_TYPE[role]
        };

        next();
    } catch (err) {
        next(err);
    }
};

export const upsertAdminUser = async (dbExecutor, adminUser) => {
    await dbExecutor.query(
        `INSERT INTO tokki_shop.users(clerk_user_id, email, user_type)
         VALUES($1, $2, $3)
         ON CONFLICT(clerk_user_id) DO UPDATE SET email = EXCLUDED.email, user_type = EXCLUDED.user_type`,
        [adminUser.clerk_user_id, adminUser.email, adminUser.user_type]
    );
};
