import truckImg from "@/assets/truck.png";

const TruckLogo = () => (
  <div className="flex items-center justify-center gap-3 py-3 bg-black px-4">
    <img src={truckImg} alt="STAF Transport" width={80} height={40} className="h-10 w-auto object-contain" />
    <div className="font-black text-xl tracking-wider">
      <span className="text-red-500">STAF</span>{" "}
      <span className="text-green-500">TRANS</span>
      <span className="text-white">PORT</span>
    </div>
  </div>
);

export default TruckLogo;
