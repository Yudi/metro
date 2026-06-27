import type { Meta, StoryObj } from '@storybook/angular';
import {
  AGENCIES_DATA,
  AgenciesData,
  TransitAgency,
} from '@metro/shared/utils';
import { AgencyContacts } from './agency-contacts';

type ContactMode = 'todos' | 'telefone' | 'whatsapp' | 'sms' | 'semTelefones';
type AgencyStoryArgs = AgencyContacts & {
  agencyKey: TransitAgency;
  contactMode: ContactMode;
  showAdditionalInformation: boolean;
};

function createAgency(
  agencyKey: TransitAgency,
  contactMode: ContactMode,
  showAdditionalInformation: boolean,
): { agencyKey: string } & AgenciesData[TransitAgency] {
  const agency = AGENCIES_DATA[agencyKey];
  const filteredPhones = agency.contact.phones.filter((phone) => {
    switch (contactMode) {
      case 'telefone':
        return !phone.whatsapp && !phone.sms;
      case 'whatsapp':
        return phone.whatsapp;
      case 'sms':
        return phone.sms;
      case 'semTelefones':
        return false;
      case 'todos':
      default:
        return true;
    }
  });

  return {
    agencyKey,
    ...agency,
    contact: {
      ...agency.contact,
      phones: filteredPhones,
      additionalInformation: showAdditionalInformation
        ? agency.contact.additionalInformation
        : undefined,
    },
  };
}

const meta: Meta<AgencyStoryArgs> = {
  title: 'Lite/Contacts/Agency contacts',
  component: AgencyContacts,
  tags: ['autodocs'],
  argTypes: {
    agencyKey: {
      control: 'select',
      options: Object.values(TransitAgency),
      description: 'Agência usada como massa de dados da história.',
    },
    contactMode: {
      control: 'select',
      options: ['todos', 'telefone', 'whatsapp', 'sms', 'semTelefones'],
      description: 'Filtra os canais exibidos no card de contato.',
    },
    showAdditionalInformation: {
      control: 'boolean',
      description: 'Exibe a observação adicional quando a agência possui uma.',
    },
  },
  args: {
    agencyKey: TransitAgency.METRO,
    contactMode: 'todos',
    showAdditionalInformation: true,
  },
  render: ({ agencyKey, contactMode, showAdditionalInformation }) => ({
    props: {
      agency: createAgency(
        agencyKey,
        contactMode,
        showAdditionalInformation,
      ),
    },
    template: '<app-agency-contacts [agency]="agency" />',
  }),
};

export default meta;
type Story = StoryObj<AgencyStoryArgs>;

export const Metro: Story = {};

export const WhatsApp: Story = {
  args: {
    agencyKey: TransitAgency.VIAQUATRO,
    contactMode: 'whatsapp',
    showAdditionalInformation: false,
  },
};

export const Onibus: Story = {
  args: {
    agencyKey: TransitAgency.EMTU,
    contactMode: 'telefone',
    showAdditionalInformation: true,
  },
};
