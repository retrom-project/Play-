#include "RetromPad.h"

std::atomic<unsigned int> CRetromPad::m_values[2][PS2::CControllerInfo::MAX_BUTTONS]{};
std::atomic<bool> CRetromPad::m_enabled[2]{};

void CRetromPad::Update(uint8* ram)
{
	CPH_GenericInput::Update(ram);
	for(auto* listener : m_interfaces)
	{
		for(unsigned int pad = 0; pad < 2; pad++)
		{
			if(!m_enabled[pad].load()) continue;
			for(unsigned int i = 0; i < PS2::CControllerInfo::MAX_BUTTONS; i++)
			{
				auto button = static_cast<PS2::CControllerInfo::BUTTON>(i);
				auto value = m_values[pad][i].load();
				if(PS2::CControllerInfo::IsAxis(button))
					listener->SetAxisState(pad, button, value, ram);
				else
					listener->SetButtonState(pad, button, value != 0, ram);
			}
		}
	}
}

void CRetromPad::Set(unsigned int pad, unsigned int button, unsigned int value)
{
	if(pad < 2 && button < PS2::CControllerInfo::MAX_BUTTONS && value <= 255)
		m_values[pad][button] = value;
}

void CRetromPad::Enable(unsigned int pad, bool enabled)
{
	if(pad < 2) m_enabled[pad] = enabled;
}

CPadHandler::FactoryFunction CRetromPad::Factory()
{
	return []() { return new CRetromPad(); };
}
