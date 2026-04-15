//! Built-in integration providers.

pub mod http_generic;
pub mod slack;
pub mod discord;
pub mod telegram;
pub mod notion;
pub mod airtable;
pub mod jira;
pub mod linear;
pub mod github_ext;
pub mod sendgrid;
pub mod twilio;
pub mod stripe;
pub mod shopify;
pub mod google_drive;
pub mod google_sheets;
pub mod gmail;
pub mod google_calendar;
pub mod onedrive;
pub mod outlook;
pub mod rss;
pub mod postgres;
pub mod webhook;
pub mod hubspot;
pub mod todoist;

use super::{Integration, IntegrationRegistry};
use std::sync::Arc;

/// Register all built-in integrations.
pub async fn register_all(registry: &IntegrationRegistry) {
    let providers: Vec<Arc<dyn Integration>> = vec![
        // Generic (anyone can use immediately)
        Arc::new(http_generic::HttpGenericIntegration),
        Arc::new(webhook::WebhookIntegration),
        Arc::new(rss::RssIntegration),
        // Messaging
        Arc::new(slack::SlackIntegration),
        Arc::new(discord::DiscordIntegration),
        Arc::new(telegram::TelegramIntegration),
        // Productivity
        Arc::new(notion::NotionIntegration),
        Arc::new(airtable::AirtableIntegration),
        Arc::new(todoist::TodoistIntegration),
        // Project Management
        Arc::new(jira::JiraIntegration),
        Arc::new(linear::LinearIntegration),
        // Developer
        Arc::new(github_ext::GitHubExtIntegration),
        // Google
        Arc::new(gmail::GmailIntegration),
        Arc::new(google_drive::GoogleDriveIntegration),
        Arc::new(google_sheets::GoogleSheetsIntegration),
        Arc::new(google_calendar::GoogleCalendarIntegration),
        // Microsoft
        Arc::new(outlook::OutlookIntegration),
        Arc::new(onedrive::OneDriveIntegration),
        // Email & Notifications
        Arc::new(sendgrid::SendGridIntegration),
        Arc::new(twilio::TwilioIntegration),
        // Finance & Commerce
        Arc::new(stripe::StripeIntegration),
        Arc::new(shopify::ShopifyIntegration),
        // CRM
        Arc::new(hubspot::HubSpotIntegration),
        // Database
        Arc::new(postgres::PostgresIntegration),
    ];
    for p in providers {
        registry.register(p).await;
    }
}
