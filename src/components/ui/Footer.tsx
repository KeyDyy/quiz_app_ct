import Link from "next/link";

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-gray-950 border-t border-zinc-300 bottom-0 inset-x-0 sticky">
      <div className="flex items-center justify-between px-8 mx-auto max-w-7xl py-4 text-xs md:text-sm lg:text-base">
        <div>
          <p>&copy; {new Date().getFullYear()} Wszystkie prawa zastrzeżone </p>
        </div>
        <div>
          <ul className="flex space-x-4">
            <li>
              <Link href="/about">
                <p>O nas</p>
              </Link>
            </li>
            <li>
              <Link href="/contact">
                <p>Kontakt</p>
              </Link>
            </li>
            <li>
              <Link href="/privacy">
                <p>Polityka Prywatności</p>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
