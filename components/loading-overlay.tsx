import Image from "next/image"

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-24 w-24">
          <Image
            src="/VSN_Groups_LOGO-removebg-preview.png"
            alt="Loading"
            width={100}
            height={100}
            className="h-full w-full object-contain drop-shadow-lg"
            quality={100}
            priority
          />
          <div className="absolute inset-[2px] rounded-full border-2 border-transparent border-t-blue-600 border-r-blue-500 animate-spin" />
        </div>
        <p className="text-white text-lg font-semibold">Loading...</p>
      </div>
    </div>
  )
}
