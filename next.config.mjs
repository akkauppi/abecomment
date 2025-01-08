/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
      return [
        {
          source: '/',
          destination: '/feedback',
          permanent: true,
        },
      ]
    },
  }
  
 

export default nextConfig;
