'use client';

import dynamic from 'next/dynamic';

const Logo = dynamic(() => import('@/components/logo'), { ssr: false });

export default function SupportPage() {
  return (
    <div className="h-dvh p-4 flex bg-white">
      <div className="rounded-3xl w-full flex flex-col items-center justify-center from-primary/20 to-background p-4 bg-[url('/bg.webp')] bg-cover bg-center">
        <div className="w-full max-w-2xl flex flex-col items-center space-y-8">
          <div className="absolute top-0 left-0 right-0 w-full p-0 pt-8">
            <div className="max-w-md mx-auto flex flex-start justify-center">
              <Logo width={300} height={160} className="sm:w-[400px] sm:h-[214px]" />
            </div>
          </div>

          <div className="text-center space-y-6 mt-20">
            <h1 className="text-2xl md:text-3xl font-semibold text-black">Support</h1>
            <p className="text-lg md:text-xl text-black">
              For any questions or assistance, please email us at:{' '}
              <a 
                href="mailto:contact@reactnativevibecode.com"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                contact@reactnativevibecode.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 