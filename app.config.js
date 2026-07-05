export const settings = {
    app: {
        name: "SAS",
        version: "2.0.0",
        description: "SAP Business One Portal",
        apiVersion: "v1",
        supportEmail: "support@example.com"
    },
    theme: {
        skin: "light",
        primaryColor: "#0061f2",
        secondaryColor: "#6900f2",
        fontFamily: "Poppins, sans-serif"
    },
    api: {
        baseUrl: process.env.NEXT_PUBLIC_API_URL,
        timeout: 30000, // 30 seconds
    },
    features: {
        darkMode: true,
        notifications: true,
        analytics: process.env.NODE_ENV === 'production'
    },
    defaults: {
        language: "en",
        currency: "USD",
        dateFormat: "DD/MM/YYYY"
    }
};
export default { settings };
