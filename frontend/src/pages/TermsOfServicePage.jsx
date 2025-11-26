import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

const termsContent = `
# Terms of Service

**Last Updated:** November 21, 2025
**Version:** 1.0

## 1. Acceptance of Terms

By accessing or using Battle Arena ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you must not use the Service.

## 2. Eligibility

### Age Requirement
- You must be at least **18 years of age** to use this Service
- By registering, you confirm that you are of legal gambling age in your jurisdiction
- We reserve the right to verify your age at any time

### Prohibited Jurisdictions
- You must not access the Service from jurisdictions where online gambling is prohibited
- It is your responsibility to ensure compliance with local laws

## 3. Account Registration

### Your Responsibilities
- Provide accurate, current, and complete information
- Maintain the security of your password
- Notify us immediately of any unauthorized access
- You are responsible for all activity under your account

### Account Restrictions
- One account per person
- Accounts are non-transferable
- We reserve the right to suspend or terminate accounts that violate these terms

## 4. Game Rules

### Crash Game Mechanics
- Each round has a randomly generated crash point
- Players must cash out before the multiplier crashes
- Bets are final once placed
- Automatic cashout features are available but not guaranteed

### Provable Fairness
- All game outcomes use cryptographically secure random generation
- Game results can be independently verified
- Historical game data is maintained for transparency

## 5. Financial Terms

### Deposits
- Minimum deposit: 50 KES
- Maximum deposit: 100,000 KES per transaction
- Deposits are processed via M-Pesa
- Deposits are non-refundable once credited to your account

### Withdrawals
- Minimum withdrawal: 100 KES
- Maximum withdrawal: 500,000 KES per transaction
- Withdrawals processed within 24 hours
- We reserve the right to verify identity before processing withdrawals

### Fees
- No deposit fees
- M-Pesa transaction fees may apply
- We reserve the right to introduce fees with 30 days notice

## 6. Responsible Gambling

### Self-Exclusion
- You may request to self-exclude from the Service
- Self-exclusion periods range from 24 hours to permanent
- During self-exclusion, you cannot access your account or place bets

### Deposit Limits
- You can set daily, weekly, or monthly deposit limits
- Limit reductions take effect immediately
- Limit increases have a 24-hour cooling-off period

### Warning Signs
If you experience any of the following, please seek help:
- Spending more than you can afford
- Chasing losses
- Gambling interfering with daily life
- Lying about gambling activities

**Help Resources:**
- Kenya National Campaign Against Drug Abuse (NACADA): +254-722-724-811
- Gamblers Anonymous: [Contact information]

## 7. Prohibited Activities

You must not:
- Use the Service for money laundering or fraud
- Use bots, scripts, or automated tools
- Exploit bugs or vulnerabilities
- Share or sell your account
- Create multiple accounts
- Engage in collusion with other players
- Reverse engineer or attempt to access our systems

## 8. Intellectual Property

- All content, trademarks, and intellectual property belong to Battle Arena
- You may not copy, modify, or distribute our content without permission
- User-generated content (if any) remains your property but you grant us a license to use it

## 9. Limitation of Liability

### Service Availability
- We provide the Service "as is" without warranties
- We do not guarantee uninterrupted or error-free service
- Scheduled maintenance may cause temporary downtime

### Maximum Liability
- Our liability is limited to the balance in your account
- We are not liable for indirect, incidental, or consequential damages
- We are not responsible for losses due to technical failures, unless caused by our gross negligence

## 10. Dispute Resolution

### Process
1. Contact our support team with your complaint
2. We will investigate and respond within 7 business days
3. If unresolved, disputes may be escalated to mediation
4. All disputes are subject to Kenyan law

### Governing Law
- These terms are governed by the laws of Kenya
- Disputes will be resolved in Kenyan courts

## 11. Privacy

- Your use of the Service is also governed by our [Privacy Policy](/privacy)
- We collect and process personal data as described in our Privacy Policy
- You consent to data processing when you use the Service

## 12. Changes to Terms

- We may update these terms at any time
- Changes will be posted on this page with an updated "Last Updated" date
- Continued use of the Service after changes constitutes acceptance
- For material changes, we will notify you via email

## 13. Account Termination

### By You
- You may close your account at any time
- Withdraw your balance before closing
- Closed accounts cannot be reopened

### By Us
We may suspend or terminate your account if:
- You violate these terms
- You provide false information
- We suspect fraudulent activity
- Required by law or regulators

## 14. Bonus and Promotion Terms

- Bonuses are subject to additional terms and conditions
- Bonuses may have wagering requirements
- We reserve the right to modify or cancel promotions
- Bonus abuse may result in forfeiture and account termination

## 15. Communication

### How We Contact You
- Email to your registered address
- In-app notifications
- Service announcements on our website

### How You Contact Us
- Email: support@battlearena.com
- In-app support chat
- Response time: Within 24 hours

## 16. Miscellaneous

### Severability
If any provision is found invalid, the remaining provisions remain in effect.

### Entire Agreement
These terms constitute the entire agreement between you and Battle Arena.

### Assignment
You may not assign your rights under these terms. We may assign our rights to a successor or affiliate.

### Force Majeure
We are not liable for delays or failures due to circumstances beyond our control.

---

## Contact Information

**Battle Arena**
Email: support@battlearena.com
Website: [Your website URL]

---

**By clicking "I Accept" during registration, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.**

For more information, see our:
- [Privacy Policy](/privacy)
- [Responsible Gambling Policy](/responsible-gambling)
`;

const TermsOfServicePage = () => {
  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '40px 20px',
      color: '#fff',
      backgroundColor: '#0f0f1e',
      minHeight: '100vh'
    }}>
      <Link
        to="/"
        style={{
          display: 'inline-block',
          marginBottom: '20px',
          color: '#00D1FF',
          textDecoration: 'none',
          fontSize: '14px'
        }}
      >
        ← Back to Home
      </Link>

      <div style={{
        backgroundColor: '#1a1a2e',
        padding: '40px',
        borderRadius: '8px',
        lineHeight: '1.8'
      }}>
        <ReactMarkdown
          components={{
            h1: ({node, ...props}) => <h1 style={{ color: '#00D1FF', marginBottom: '20px' }} {...props} />,
            h2: ({node, ...props}) => <h2 style={{ color: '#00D1FF', marginTop: '40px', marginBottom: '15px', fontSize: '24px' }} {...props} />,
            h3: ({node, ...props}) => <h3 style={{ color: '#FF2D75', marginTop: '30px', marginBottom: '10px', fontSize: '20px' }} {...props} />,
            p: ({node, ...props}) => <p style={{ marginBottom: '15px', color: '#ddd' }} {...props} />,
            ul: ({node, ...props}) => <ul style={{ marginBottom: '15px', paddingLeft: '30px' }} {...props} />,
            ol: ({node, ...props}) => <ol style={{ marginBottom: '15px', paddingLeft: '30px' }} {...props} />,
            li: ({node, ...props}) => <li style={{ marginBottom: '8px', color: '#ddd' }} {...props} />,
            strong: ({node, ...props}) => <strong style={{ color: '#00D1FF' }} {...props} />,
            hr: ({node, ...props}) => <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '30px 0' }} {...props} />,
            a: ({node, ...props}) => <Link style={{ color: '#00D1FF', textDecoration: 'none' }} {...props} />
          }}
        >
          {termsContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default TermsOfServicePage;
