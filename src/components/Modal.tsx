import * as Dialog from "@radix-ui/react-dialog";
import { IoMdClose } from "react-icons/io";

interface ModalProps {
  isOpen: boolean;
  onChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onChange,
  title,
  description,
  children,
}) => {
  return (
    <Dialog.Root open={isOpen} defaultOpen={isOpen} onOpenChange={onChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="
            bg-gray-900/50 
            backdrop-blur-sm
            fixed 
            inset-0
            
          "
        />
        <Dialog.Content
          className="
          fixed
          inset-0
          lg:mb-16
          lg:mt-24
          rounded-lg
          z-10
          bg-gray-100
          p-8
          pt-24
          sm:p-24
          lg:pt-16
          lg:p-12
          lg:max-w-[500px]
          min-h-[250px]
          lg:h-auto
          mx-auto
          focus:outline-none
          overflow-y-auto
          "
        >
          <Dialog.Title
            className="
              text-xl 
              text-center 
              font-bold 
              mb-4
            "
          >
            {title}
          </Dialog.Title>
          <Dialog.Description
            className="
              mb-5 
              text-sm 
              leading-normal 
              text-center
            "
          >
            {description}
          </Dialog.Description>
          <div>{children}</div>
          <Dialog.Close asChild>
            <button
              className="
                text-neutral-400 
                hover:text-black 
                absolute 
                
                lg:top-[10px] 
                lg:right-[10px] 
                lg:inline-flex 
                lg:h-[25px] 
                lg:w-[25px] 
                lg:items-center 
                lg:justify-center 
              
                top-[100px]
                right-[32px]
                sm:right-[96px]
              "
              aria-label="Close"
            >
              <IoMdClose />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default Modal;
