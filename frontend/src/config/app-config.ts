import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "StayWise",
  version: packageJson.version,
  copyright: `© ${currentYear}, StayWise. All rights reserved.`,
  meta: {
    title: "StayWise - Enterprise Churn Prediction & Retention Platform",
    description:
      "StayWise is an enterprise-grade ML platform for churn prediction and customer retention. Built with Next.js, FastAPI, Airflow, and MLflow — powered by real-time RFM analytics and automated retention workflows.",
  },
};
