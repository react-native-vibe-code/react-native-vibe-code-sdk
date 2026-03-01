'use client';

import dynamic from 'next/dynamic';

const Logo = dynamic(() => import('@/components/logo'), { ssr: false });

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh p-4 flex bg-white">
      <div className="rounded-3xl w-full flex flex-col items-center from-primary/20 to-background p-4 bg-[url('/bg.webp')] bg-cover bg-center">
        <div className="w-full max-w-3xl flex flex-col items-center space-y-8 py-8">
          <div className="w-full p-0 pt-4">
            <div className="max-w-md mx-auto flex flex-start justify-center">
              <Logo width={300} height={160} className="sm:w-[400px] sm:h-[214px]" />
            </div>
          </div>

          <div className="w-full bg-white/90 backdrop-blur-sm rounded-2xl p-6 md:p-10 shadow-lg">
            <h1 className="text-2xl md:text-3xl font-bold text-black mb-6 text-center">
              Privacy Policy
            </h1>

            <div className="prose prose-sm md:prose-base max-w-none text-black space-y-6">
              <p className="text-gray-600 font-medium">
                <strong>Effective Date:</strong> [Insert Effective Date]
              </p>

              <p>
                Postea (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application (the &quot;App&quot;). Please read this policy carefully.
              </p>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">1. Information We Collect</h2>

                <h3 className="text-lg font-medium mt-4 mb-2">Personal Information</h3>
                <p>We may collect personal information that you voluntarily provide when using the App, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Name and email address</li>
                  <li>Account credentials</li>
                  <li>Profile information</li>
                  <li>Contact information</li>
                </ul>

                <h3 className="text-lg font-medium mt-4 mb-2">Automatically Collected Information</h3>
                <p>When you use our App, we may automatically collect certain information, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Device information (device type, operating system, unique device identifiers)</li>
                  <li>Usage data (features used, time spent in app, crash reports)</li>
                  <li>IP address and general location information</li>
                  <li>App performance data</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">2. How We Use Your Information</h2>
                <p>We use the information we collect for various purposes, including:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Providing, maintaining, and improving the App</li>
                  <li>Creating and managing your account</li>
                  <li>Responding to your inquiries and providing customer support</li>
                  <li>Sending you updates, security alerts, and administrative messages</li>
                  <li>Analyzing usage patterns to improve user experience</li>
                  <li>Detecting, preventing, and addressing technical issues or fraud</li>
                  <li>Complying with legal obligations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">3. Sharing of Information</h2>
                <p>We may share your information in the following circumstances:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Service Providers:</strong> We may share information with third-party vendors who perform services on our behalf, such as hosting, analytics, and customer support.</li>
                  <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid legal requests.</li>
                  <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred.</li>
                  <li><strong>With Your Consent:</strong> We may share information for other purposes with your explicit consent.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">4. Data Security</h2>
                <p>
                  We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">5. Data Retention</h2>
                <p>
                  We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When your information is no longer needed, we will securely delete or anonymize it.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">6. Your Rights and Choices</h2>
                <p>Depending on your location, you may have certain rights regarding your personal information:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access:</strong> Request access to your personal information</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate information</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                  <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
                  <li><strong>Opt-out:</strong> Opt out of certain data processing activities</li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, please contact us using the information provided below.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">7. Children&apos;s Privacy</h2>
                <p>
                  Our App is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information promptly.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">8. Third-Party Links and Services</h2>
                <p>
                  The App may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party services you access through our App.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">9. Changes to This Privacy Policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Effective Date.&quot; Your continued use of the App after any changes indicates your acceptance of the updated policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mt-6 mb-3">10. Contact Us</h2>
                <p>
                  If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:
                </p>
                <p className="mt-2">
                  <strong>Email:</strong>{' '}
                  <a href="mailto:contact@reactnativevibecode.com" className="text-blue-600 hover:text-blue-800 underline">
                    contact@reactnativevibecode.com
                  </a>
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
