import { IMAGE_ENTRY_FIXTURE } from '@metro/shared/admin-contracts';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { TransitPlacePhotoComponent, TransitPlacePhotoCreditComponent } from './transit-place-photo.component';

const meta: Meta<TransitPlacePhotoCreditComponent> = {
  title: 'Shared/TransitPlacePhoto',
  component: TransitPlacePhotoCreditComponent,
  decorators: [moduleMetadata({ imports: [TransitPlacePhotoComponent] })],
  args: { image: IMAGE_ENTRY_FIXTURE },
  parameters: { docs: { description: { component: 'Photo framing and attribution shared by rail stations, bus terminals and bus stops. Credit placement belongs to the containing detail view.' } } },
};
export default meta;
type Story = StoryObj<TransitPlacePhotoCreditComponent>;

export const CreditWithLinks: Story = {};
export const CreditWithoutLinks: Story = {
  args: { image: { ...IMAGE_ENTRY_FIXTURE, sourceUrl: undefined, licenseUrl: undefined } },
};
export const LongCredit: Story = {
  args: { image: { ...IMAGE_ENTRY_FIXTURE, author: 'Equipe de documentação do transporte metropolitano de São Paulo', license: 'Creative Commons Atribuição – Compartilha Igual 4.0 Internacional' } },
};
