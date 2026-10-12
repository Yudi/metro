import type { Meta, StoryObj } from '@storybook/angular';
import { BUS_TERMINAL_DETAIL_FIXTURE } from '@metro/shared/bus-terminal-contracts';
import { TransitRouteIdentityComponent } from './transit-route-identity.component';

const meta: Meta<TransitRouteIdentityComponent> = {
  title: 'Shared/Transit route identity',
  component: TransitRouteIdentityComponent,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<TransitRouteIdentityComponent>;

const [sptrans, artesp] = BUS_TERMINAL_DETAIL_FIXTURE.routes;
export const SPTrans: Story = {
  args: { code: sptrans.shortName, sourceAgency: sptrans.sourceAgency, color: sptrans.color, textColor: sptrans.textColor },
};
export const Artesp: Story = {
  args: { code: artesp.shortName, sourceAgency: artesp.sourceAgency, color: artesp.color, textColor: artesp.textColor },
};
export const UnknownAgency: Story = {
  args: { code: sptrans.shortName, sourceAgency: 'other' },
};
