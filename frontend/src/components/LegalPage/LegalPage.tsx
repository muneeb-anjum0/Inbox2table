import React from 'react';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import './LegalPage.css';

type LegalPageKind = 'privacy' | 'terms';

interface LegalPageProps {
  kind: LegalPageKind;
}

const lastUpdated = 'May 25, 2026';

const privacySections = [
  {
    title: 'What Inbox2Table Does',
    body: 'Inbox2Table connects to your Gmail account only after you grant permission, searches for timetable-related emails, parses class schedule details, and displays them in the app. If you enable daily email delivery, the app sends your formatted timetable to the personal email address you save.',
  },
  {
    title: 'Information We Process',
    body: 'The app may process your Google account email address, selected Gmail message metadata and content needed to find timetable emails, configured semesters, generated timetable entries, personal delivery email address, and automation delivery status.',
  },
  {
    title: 'How We Use Your Data',
    body: 'Your data is used to authenticate your session, find and parse timetable emails, show your class schedule, remember your semester preferences, and send optional daily timetable emails. Inbox2Table does not sell your data or use it for advertising.',
  },
  {
    title: 'Google User Data',
    body: 'Gmail access is used only for the timetable features you request. The app does not transfer Google user data to third parties except as necessary to provide app functionality, comply with law, or protect the service.',
  },
  {
    title: 'Storage And Security',
    body: 'Configuration data may be stored in the backend database so your timetable settings continue working across sessions. OAuth credentials and delivery secrets are handled server-side. You should avoid sharing credentials or refresh tokens publicly.',
  },
  {
    title: 'Your Choices',
    body: 'You can sign out, disable daily email delivery, change the personal delivery address, or revoke Google access from your Google Account security settings at any time.',
  },
  {
    title: 'Contact',
    body: 'For privacy questions or access requests, contact the developer at muneeb.anjum0@gmail.com.',
  },
];

const termsSections = [
  {
    title: 'Using The Service',
    body: 'Inbox2Table is provided to help students organize timetable emails into a readable schedule. You agree to use the app only with accounts and timetable data you are allowed to access.',
  },
  {
    title: 'Account Access',
    body: 'The app relies on Google OAuth. You are responsible for choosing the Google account you connect and for revoking access if you no longer want Inbox2Table to process that account.',
  },
  {
    title: 'Daily Email Automation',
    body: 'If you enable daily delivery, Inbox2Table may run scheduled automation and send formatted timetable emails to the personal email address you save. You can disable this feature from the app.',
  },
  {
    title: 'Accuracy',
    body: 'Inbox2Table parses timetable emails automatically. While the app is designed to be helpful, parsed schedules may contain mistakes if source emails are missing, delayed, formatted unusually, or changed by the institution.',
  },
  {
    title: 'Acceptable Use',
    body: 'Do not use Inbox2Table to access another person’s email, send unwanted messages, abuse Google services, overload the backend, or attempt to bypass security controls.',
  },
  {
    title: 'Changes',
    body: 'These terms may be updated as the project changes. Continued use after updates means you accept the revised terms.',
  },
  {
    title: 'Contact',
    body: 'For questions about these terms, contact muneeb.anjum0@gmail.com.',
  },
];

const LegalPage: React.FC<LegalPageProps> = ({ kind }) => {
  const isPrivacy = kind === 'privacy';
  const sections = isPrivacy ? privacySections : termsSections;

  return (
    <main className="legal-page">
      <section className="legal-shell">
        <nav className="legal-nav" aria-label="Legal navigation">
          <a href="/" className="legal-back">
            <ArrowLeft size={17} />
            <span>Back to Inbox2Table</span>
          </a>

          <div className="legal-tabs">
            <a className={isPrivacy ? 'active' : ''} href="/privacy">Privacy Policy</a>
            <a className={!isPrivacy ? 'active' : ''} href="/terms">Terms</a>
          </div>
        </nav>

        <header className="legal-hero">
          <div className="legal-icon">
            {isPrivacy ? <ShieldCheck size={28} /> : <FileText size={28} />}
          </div>
          <p className="legal-eyebrow">Inbox2Table</p>
          <h1>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
          <p>
            {isPrivacy
              ? 'Clear rules for how Inbox2Table handles Gmail access, timetable data, and daily email delivery.'
              : 'The terms for using Inbox2Table to parse timetable emails and automate daily schedule delivery.'}
          </p>
          <span>Last updated {lastUpdated}</span>
        </header>

        <div className="legal-content">
          {sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
};

export default LegalPage;
