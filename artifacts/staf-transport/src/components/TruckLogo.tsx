import truckImg from "@/assets/truck.png";

const TruckLogo = () => (
  <div className="flex items-center justify-center gap-3 py-3 bg-black px-4">
    <img src={truckImg} alt="Sabrinos" width={80} height={40} className="h-10 w-auto object-contain" />
    <div className="font-black text-xl tracking-wider leading-tight text-center">
      <div>
        <span className="text-red-500">SABR</span>
        <span className="text-white">INOS</span>
      </div>
      <div className="text-xs text-green-500 font-bold tracking-widest">GESTION DES PLANS</div>
    </div>
  </div>
);

export default TruckLogo;
